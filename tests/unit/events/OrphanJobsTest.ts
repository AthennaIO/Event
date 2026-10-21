/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Config } from '@athenna/config'
import { Event } from '#src/facades/Event'
import { Path, Sleep } from '@athenna/common'
import { LoggerProvider } from '@athenna/logger'
import { Queue, QueueProvider } from '@athenna/queue'
import { EventProvider } from '#src/providers/EventProvider'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'

export class OrphanJobsTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    await new LoggerProvider().register()
    await new QueueProvider().register()
    await new EventProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    Event.clearListeners()

    await new QueueProvider().shutdown()
    await new EventProvider().shutdown()
    await new LoggerProvider().shutdown()

    Config.clear()
    ioc.reconstruct()
  }

  @Test()
  public async shouldLeaveJobsOfUnknownListenersForRedeliveryInsideTheGrace({ assert }: Context) {
    Config.set('event.orphanGraceMs', 10000)

    const event = Event.store('memoryA')

    event.on('keep:consumer:alive', () => {})

    const main = Queue.connection('memoryA').queue('events-a')
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')

    await main.add({ listenerId: 'other-version-listener-id', event: 'x', data: {}, emittedAt: Date.now() })

    await Sleep.for(40).milliseconds().wait()

    assert.deepEqual(await main.length(), 1)
    assert.deepEqual(await dlq.length(), 0)
  }

  @Test()
  public async shouldSendJobsOfUnknownListenersToTheDeadletterPastTheGrace({ assert }: Context) {
    Config.set('event.orphanGraceMs', 60)

    const event = Event.store('memoryA')

    event.on('keep:consumer:alive', () => {})

    const main = Queue.connection('memoryA').queue('events-a')
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')
    const payload = { listenerId: 'removed-listener-id', event: 'x', data: { id: 1 }, emittedAt: Date.now() }

    await main.add(payload)

    await Sleep.for(20).milliseconds().wait()

    /**
     * Inside the grace the job keeps being redelivered. The driver already
     * burned its attempts, but it would never reach the deadletter by
     * itself: the job would loop forever.
     */
    assert.deepEqual(await main.length(), 1)
    assert.isBelow((await main.peek())?.attempts ?? 0, 2)

    await Sleep.for(100).milliseconds().wait()

    assert.deepEqual(await main.length(), 0)
    assert.deepEqual(await dlq.length(), 1)
    assert.deepEqual((await dlq.peek()).data, payload)
  }

  @Test()
  public async shouldSendTheJobsOfARemovedListenerToTheDeadletterWithTheOrphanCheck({ assert }: Context) {
    Config.set('event.orphanGraceMs', 40)

    const event = Event.store('memoryA')
    const runs = []

    event.on('keep:consumer:alive', () => {})

    const listener = event.on('orphan:removed', ctx => runs.push(ctx), { delay: 20 })

    await event.emit('orphan:removed', { id: 1 })

    const queue = Queue.connection('memoryA').queue(`events-a:${listener.id}`)
    const main = Queue.connection('memoryA').queue('events-a')
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')

    /**
     * The job sleeps in the listener queue and the orphan check sleeps in
     * the queue of the connection. Then the listener is removed (a deploy
     * that renamed or deleted it): nobody pulls its queue anymore.
     */
    assert.deepEqual(await queue.length(), 1)
    assert.deepEqual(await main.length(), 1)

    listener.remove()

    await Sleep.for(250).milliseconds().wait()

    assert.lengthOf(runs, 0)
    assert.deepEqual(await queue.length(), 0)
    assert.deepEqual(await main.length(), 0)
    assert.deepEqual(await dlq.length(), 1)
    assert.deepInclude((await dlq.peek()).data, { listenerId: listener.id, event: 'orphan:removed', data: { id: 1 } })
  }

  @Test()
  public async shouldNotTouchTheJobsOfAnOwnedQueueWhenCheckingOrphans({ assert }: Context) {
    Config.set('event.orphanGraceMs', 20)

    const event = Event.store('memoryA')
    const runs = []

    const listener = event.on('orphan:owned', ctx => runs.push(ctx))

    const main = Queue.connection('memoryA').queue('events-a')
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')
    const queue = Queue.connection('memoryA').queue(`events-a:${listener.id}`)

    /**
     * A job past the grace in a queue this instance owns runs normally, and
     * the orphan check of that queue is just acked.
     */
    await queue.add({ listenerId: listener.id, event: 'orphan:owned', data: {}, emittedAt: 1, dueAt: 1 })
    await main.add({ orphanCheck: `events-a:${listener.id}`, emittedAt: 1, dueAt: 1 })

    await Sleep.for(40).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.deepEqual(await main.length(), 0)
    assert.deepEqual(await dlq.length(), 0)
  }

  @Test()
  public async shouldNotTouchOrphanJobsInsideTheGraceWhenCheckingOrphans({ assert }: Context) {
    Config.set('event.orphanGraceMs', 10000)

    const event = Event.store('memoryA')

    event.on('keep:consumer:alive', () => {})

    const main = Queue.connection('memoryA').queue('events-a')
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')
    const foreign = Queue.connection('memoryA').queue('events-a:NewerVersionListener')

    await foreign.add({ listenerId: 'newer-id', event: 'x', data: {}, emittedAt: Date.now(), dueAt: Date.now() })
    await main.add({ orphanCheck: 'events-a:NewerVersionListener', emittedAt: Date.now(), dueAt: Date.now() })

    await Sleep.for(40).milliseconds().wait()

    assert.deepEqual(await main.length(), 0)
    assert.deepEqual(await dlq.length(), 0)
    assert.deepEqual(await foreign.length(), 1)
    assert.equal((await foreign.peek()).attempts, 2)
  }

  @Test()
  public async shouldScheduleOneOrphanCheckPerListenerQueueAndWindow({ assert }: Context) {
    const event = Event.store('memoryA')

    const listener = event.on('orphan:window', () => {}, { delay: ctx => ctx.data.delay })

    const main = Queue.connection('memoryA').queue('events-a')

    await event.emit('orphan:window', { delay: 60000 })
    await event.emit('orphan:window', { delay: 60000 })
    await event.emit('orphan:window', { delay: 60000 })

    assert.deepEqual(await Queue.connection('memoryA').queue(`events-a:${listener.id}`).length(), 3)
    assert.deepEqual(await main.length(), 1)

    await event.emit('orphan:window', { delay: 3 * 60 * 60 * 1000 })

    assert.deepEqual(await main.length(), 2)
  }

  @Test()
  public async shouldNotScheduleOrphanChecksForListenersSharingTheQueueOfTheConnection({ assert }: Context) {
    const event = Event.store('memoryA')

    event.on('orphan:shared', () => {}, { queue: 'events-a', delay: 60000 })

    await event.emit('orphan:shared', {})

    assert.deepEqual(await Queue.connection('memoryA').queue('events-a').length(), 1)
  }

  @Test()
  public async shouldDisableOrphanHandlingWhenTheGraceIsZero({ assert }: Context) {
    Config.set('event.orphanGraceMs', 0)

    const event = Event.store('memoryA')

    const listener = event.on('orphan:disabled', () => {}, { delay: 60000 })

    await event.emit('orphan:disabled', {})

    const main = Queue.connection('memoryA').queue('events-a')
    const dlq = Queue.connection('memoryA').queue('events-a-deadletter')

    assert.deepEqual(await Queue.connection('memoryA').queue(`events-a:${listener.id}`).length(), 1)
    assert.deepEqual(await main.length(), 0)

    await main.add({ listenerId: 'removed-listener-id', event: 'x', data: {}, emittedAt: 1 })
    await Sleep.for(40).milliseconds().wait()

    assert.deepEqual(await main.length(), 1)
    assert.deepEqual(await dlq.length(), 0)
  }
}
