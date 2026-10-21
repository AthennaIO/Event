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
import { Queue, QueueImpl, QueueProvider } from '@athenna/queue'
import { EventProvider } from '#src/providers/EventProvider'
import { DelayedListener } from '#tests/fixtures/listeners/DelayedListener'
import { ConditionalListener } from '#tests/fixtures/listeners/ConditionalListener'
import { DynamicDelayListener } from '#tests/fixtures/listeners/DynamicDelayListener'
import { AfterEach, BeforeEach, Mock, Test, type Context } from '@athenna/test'

export class DelayedListenersTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    await new LoggerProvider().register()
    await new QueueProvider().register()
    await new EventProvider().register()

    DelayedListener.runs = []
    ConditionalListener.runs = []
    DynamicDelayListener.runs = []
    DynamicDelayListener.delayContexts = []
  }

  @AfterEach()
  public async afterEach() {
    Event.clearListeners()

    await new QueueProvider().shutdown()
    await new EventProvider().shutdown()
    await new LoggerProvider().shutdown()

    Mock.restoreAll()
    Config.clear()
    ioc.reconstruct()
  }

  @Test()
  public async shouldDelayAClosureListenerByANumberOfMilliseconds({ assert }: Context) {
    const event = Event.store('memoryA')
    const runs = []

    const listener = event.on('delay:ms', ctx => runs.push(ctx), { delay: 60 })

    await event.emit('delay:ms', { id: 1 })
    await Sleep.for(20).milliseconds().wait()

    const queue = Queue.connection('memoryA').queue(`events-a:${listener.id}`)

    assert.lengthOf(runs, 0)
    assert.deepEqual(await queue.length(), 1)

    await Sleep.for(100).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.deepEqual(runs[0].data, { id: 1 })
    assert.equal(runs[0].dueAt - runs[0].emittedAt, 60)
    assert.deepEqual(await queue.length(), 0)
  }

  @Test()
  public async shouldDelayAClosureListenerUntilADate({ assert }: Context) {
    const event = Event.store('memoryA')
    const runs = []
    const at = new Date(Date.now() + 80)

    event.on('delay:date', ctx => runs.push(ctx), { delay: at })

    await event.emit('delay:date', { id: 1 })
    await Sleep.for(20).milliseconds().wait()

    assert.lengthOf(runs, 0)

    await Sleep.for(120).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.equal(runs[0].dueAt, at.getTime())
  }

  @Test()
  public async shouldResolveTheDelayOfAClosureListenerAtEmitTime({ assert }: Context) {
    const event = Event.store('memoryA')
    const runs = []

    event.on('delay:fn', ctx => runs.push(ctx.data.name), { delay: ctx => ctx.data.wait })

    await event.emit('delay:fn', { name: 'later', wait: 60 })
    await event.emit('delay:fn', { name: 'now', wait: 0 })
    await Sleep.for(20).milliseconds().wait()

    assert.deepEqual(runs, ['now'])

    await Sleep.for(100).milliseconds().wait()

    assert.deepEqual(runs, ['now', 'later'])
  }

  @Test()
  public async shouldRunWithoutDelayWhenTheDelayFunctionReturnsNothing({ assert }: Context) {
    const event = Event.store('memoryA')
    const add = Mock.spy(QueueImpl.prototype, 'add')
    const later = Mock.spy(QueueImpl.prototype, 'later')
    const runs = []

    event.on('delay:none', ctx => runs.push(ctx), { delay: () => null })

    await event.emit('delay:none', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.equal(runs[0].dueAt, runs[0].emittedAt)
    assert.isTrue(add.calledWithMatch({ event: 'delay:none' }))
    assert.isFalse(later.calledWithMatch(Mock.match.any, { event: 'delay:none' }))
  }

  @Test()
  public async shouldStoreDelayedListenersWithQueueLaterAndTheOthersWithQueueAdd({ assert }: Context) {
    const event = Event.store('memoryA')
    const add = Mock.spy(QueueImpl.prototype, 'add')
    const later = Mock.spy(QueueImpl.prototype, 'later')

    const delayed = event.on('delay:spy', () => 'delayed', { delay: 5000 })
    const immediate = event.on('delay:spy', () => 'immediate')

    await event.emit('delay:spy', { id: 1 })

    assert.isTrue(later.calledWithMatch(5000, { listenerId: delayed.id, event: 'delay:spy', data: { id: 1 } }))
    assert.isTrue(add.calledWithMatch({ listenerId: immediate.id, event: 'delay:spy', data: { id: 1 } }))
    assert.isFalse(add.calledWithMatch({ listenerId: delayed.id }))
  }

  @Test()
  public async shouldDelayANamedListenerWithTheListenerAnnotationDelay({ assert }: Context) {
    ioc.bind('DelayedListener', DelayedListener)

    const event = Event.store('memoryA')

    event.on('delay:annotation', 'DelayedListener')

    await event.emit('delay:annotation', { id: 1 })
    await Sleep.for(20).milliseconds().wait()

    assert.lengthOf(DelayedListener.runs, 0)
    assert.deepEqual(await Queue.connection('memoryA').queue('events-a:DelayedListener').length(), 1)

    await Sleep.for(100).milliseconds().wait()

    assert.lengthOf(DelayedListener.runs, 1)
    assert.equal(DelayedListener.runs[0].dueAt - DelayedListener.runs[0].emittedAt, 60)
  }

  @Test()
  public async shouldPreferTheEventOnDelayOverTheListenerAnnotationDelay({ assert }: Context) {
    ioc.bind('DelayedListener', DelayedListener)

    const event = Event.store('memoryA')

    event.on('delay:override', 'DelayedListener', { delay: 0 })

    await event.emit('delay:override', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(DelayedListener.runs, 1)
  }

  @Test()
  public async shouldDelayANamedListenerWithTheMillisecondsReturnedByWithDelay({ assert }: Context) {
    ioc.bind('DynamicDelayListener', DynamicDelayListener)

    const event = Event.store('memoryA')

    /**
     * `withDelay()` wins over the `@Listener({ delay: 10000 })` of the
     * fixture and over the options given to `Event.on()`.
     */
    const listener = event.on('delay:with', 'DynamicDelayListener', { delay: 20000 })

    await event.emit('delay:with', { delay: 60 })
    await Sleep.for(20).milliseconds().wait()

    assert.lengthOf(DynamicDelayListener.runs, 0)

    await Sleep.for(100).milliseconds().wait()

    assert.lengthOf(DynamicDelayListener.runs, 1)
    assert.equal(DynamicDelayListener.runs[0].dueAt - DynamicDelayListener.runs[0].emittedAt, 60)
    assert.deepEqual(DynamicDelayListener.delayContexts, [
      {
        listenerId: listener.id,
        event: 'delay:with',
        data: { delay: 60 },
        emittedAt: DynamicDelayListener.runs[0].emittedAt
      }
    ])
  }

  @Test()
  public async shouldDelayANamedListenerUntilTheDateReturnedByWithDelay({ assert }: Context) {
    ioc.bind('DynamicDelayListener', DynamicDelayListener)

    const event = Event.store('memoryA')
    const at = Date.now() + 80

    event.on('delay:with:date', 'DynamicDelayListener')

    await event.emit('delay:with:date', { at })
    await Sleep.for(20).milliseconds().wait()

    assert.lengthOf(DynamicDelayListener.runs, 0)

    await Sleep.for(120).milliseconds().wait()

    assert.lengthOf(DynamicDelayListener.runs, 1)
    assert.equal(DynamicDelayListener.runs[0].dueAt, at)
  }

  @Test()
  public async shouldRunANamedListenerNowWhenWithDelayReturnsNothing({ assert }: Context) {
    ioc.bind('DynamicDelayListener', DynamicDelayListener)

    const event = Event.store('memoryA')

    event.on('delay:with:none', 'DynamicDelayListener')

    await event.emit('delay:with:none', {})
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(DynamicDelayListener.runs, 1)
  }

  @Test()
  public async shouldThrowAndStoreNothingWhenTheDelayIsInvalid({ assert }: Context) {
    const event = Event.store('memoryA')

    const listener = event.on('delay:invalid', () => {}, { delay: () => NaN })

    await assert.rejects(() => event.emit('delay:invalid', {}), /The delay of a job must be a finite number/)

    assert.deepEqual(await Queue.connection('memoryA').queue(`events-a:${listener.id}`).length(), 0)
    assert.deepEqual(await Queue.connection('memoryA').queue('events-a').length(), 0)
  }

  @Test()
  public async shouldOnlyQueueANamedListenerWhenShouldQueueReturnsTrue({ assert }: Context) {
    ioc.bind('ConditionalListener', ConditionalListener)

    const event = Event.store('memoryA')

    event.on('conditional', 'ConditionalListener')

    await event.emit('conditional', { vip: false })
    await event.emit('conditional', { vip: true })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(ConditionalListener.runs, 1)
    assert.deepEqual(ConditionalListener.runs[0].data, { vip: true })
  }
}
