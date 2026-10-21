/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AssertionError } from 'node:assert'
import { Config } from '@athenna/config'
import { Event } from '#src/facades/Event'
import { Path, Sleep } from '@athenna/common'
import { LoggerProvider } from '@athenna/logger'
import { Queue, QueueProvider } from '@athenna/queue'
import { EventProvider } from '#src/providers/EventProvider'
import { AfterEach, BeforeEach, Test, type Context } from '@athenna/test'

export class EventFakeTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    await new LoggerProvider().register()
    await new QueueProvider().register()
    await new EventProvider().register()

    Event.store('memoryA')
  }

  @AfterEach()
  public async afterEach() {
    Event.unfake()
    Event.clearListeners()

    await new QueueProvider().shutdown()
    await new EventProvider().shutdown()
    await new LoggerProvider().shutdown()

    Config.clear()
    ioc.reconstruct()
  }

  @Test()
  public async shouldRecordEmittedEventsInsteadOfQueueingThem({ assert }: Context) {
    Event.fake()

    const runs = []
    const listener = Event.on('user:created', ctx => runs.push(ctx))

    await Event.emit('user:created', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.isTrue(Event.isFaked())
    assert.lengthOf(runs, 0)
    assert.deepEqual(await Queue.connection('memoryA').queue(`events-a:${listener.id}`).length(), 0)
    assert.deepEqual(await Queue.connection('memoryA').queue('events-a').length(), 0)
    assert.lengthOf(Event.emitted('user:created'), 1)
    assert.deepEqual(Event.emitted('user:created')[0].data, { id: 1 })

    Event.assertEmitted('user:created')
  }

  @Test()
  public async shouldAssertThatAnEventWasEmittedWithDataMatchingThePredicate({ assert }: Context) {
    Event.fake()

    await Event.emit('user:created', { id: 1 })

    Event.assertEmitted<{ id: number }>('user:created', user => user.id === 1)

    assert.throws(
      () => Event.assertEmitted<{ id: number }>('user:created', user => user.id === 2),
      AssertionError,
      'The expected "user:created" event was not emitted with data matching the predicate.'
    )
    assert.throws(
      () => Event.assertEmitted('user:deleted'),
      AssertionError,
      'The expected "user:deleted" event was not emitted.'
    )
  }

  @Test()
  public async shouldAssertThatAnEventWasNotEmitted({ assert }: Context) {
    Event.fake()

    await Event.emit('user:created', { id: 1 })

    Event.assertNotEmitted('user:deleted')
    Event.assertNotEmitted<{ id: number }>('user:created', user => user.id === 2)

    assert.throws(
      () => Event.assertNotEmitted('user:created'),
      AssertionError,
      'The unexpected "user:created" event was emitted 1 times.'
    )
  }

  @Test()
  public async shouldAssertHowManyTimesAnEventWasEmitted({ assert }: Context) {
    Event.fake()

    await Event.emit('user:created', { id: 1 })
    await Event.emit('user:created', { id: 2 })

    Event.assertEmittedTimes('user:created', 2)
    Event.assertEmittedTimes('user:deleted', 0)

    assert.throws(
      () => Event.assertEmittedTimes('user:created', 3),
      AssertionError,
      'The expected "user:created" event was emitted 2 times instead of 3 times.'
    )
  }

  @Test()
  public async shouldAssertThatNothingWasEmitted({ assert }: Context) {
    Event.fake()

    Event.assertNothingEmitted()

    await Event.emit('user:created', { id: 1 })
    await Event.emit('user:deleted', { id: 1 })

    assert.throws(
      () => Event.assertNothingEmitted(),
      AssertionError,
      '2 unexpected events were emitted: user:created, user:deleted.'
    )
  }

  @Test()
  public async shouldFakeOnlyTheGivenEvents({ assert }: Context) {
    Event.fake(['user:created'])

    const runs = []

    Event.on('user:created', ctx => runs.push(ctx.event))
    Event.on('user:deleted', ctx => runs.push(ctx.event))

    await Event.emit('user:created', { id: 1 })
    await Event.emit('user:deleted', { id: 1 })
    await Sleep.for(30).milliseconds().wait()

    assert.isTrue(Event.isFaked('user:created'))
    assert.isFalse(Event.isFaked('user:deleted'))
    assert.deepEqual(runs, ['user:deleted'])

    Event.assertEmitted('user:created')

    assert.lengthOf(Event.emitted('user:deleted'), 0)
  }

  @Test()
  public async shouldNotStartConsumersWhileFaked({ assert }: Context) {
    Event.fake()

    Event.on('user:created', () => {})
    Event.on('user:created', () => {}, { connection: 'memoryLlm' })

    assert.equal(Event.consumerCount(), 0)
  }

  @Test()
  public async shouldEmitNormallyAfterUnfake({ assert }: Context) {
    Event.fake()

    const runs = []

    Event.on('user:created', ctx => runs.push(ctx))

    await Event.emit('user:created', { id: 1 })

    Event.unfake()

    assert.isFalse(Event.isFaked())
    assert.lengthOf(Event.emitted('user:created'), 0)
    assert.equal(Event.consumerCount(), 1)

    await Event.emit('user:created', { id: 2 })
    await Sleep.for(30).milliseconds().wait()

    assert.lengthOf(runs, 1)
    assert.deepEqual(runs[0].data, { id: 2 })
  }

  @Test()
  public async shouldAssertThatAListenerIsAttachedToAnEvent({ assert }: Context) {
    ioc.bind(
      'WelcomeListener',
      class {
        public async handle() {}
      }
    )

    function auditListener() {}
    function otherListener() {}

    Event.fake()

    Event.on('user:created', 'WelcomeListener')
    Event.on('user:created', auditListener)
    Event.onAny(otherListener)

    Event.assertListening('user:created', 'WelcomeListener')
    Event.assertListening('user:created', auditListener)
    Event.assertListening('*', otherListener)

    assert.throws(
      () => Event.assertListening('user:deleted', 'WelcomeListener'),
      AssertionError,
      'The "user:deleted" event does not have the "WelcomeListener" listener attached to it.'
    )
    assert.throws(
      () => Event.assertListening('user:created', otherListener),
      AssertionError,
      'The "user:created" event does not have the "otherListener" listener attached to it.'
    )
  }

  @Test()
  public async shouldFailEveryEmitAssertionWhenTheEventIsNotFaked({ assert }: Context) {
    const message = 'The "user:created" event is not faked, call Event.fake() before asserting it.'

    /**
     * Without the fake nothing is recorded, so the negative assertions
     * would always pass.
     */
    assert.throws(() => Event.assertEmitted('user:created'), AssertionError, message)
    assert.throws(() => Event.assertNotEmitted('user:created'), AssertionError, message)
    assert.throws(() => Event.assertEmittedTimes('user:created', 0), AssertionError, message)
    assert.throws(
      () => Event.assertNothingEmitted(),
      AssertionError,
      'Events are not faked, call Event.fake() before asserting them.'
    )

    Event.fake(['user:deleted'])

    assert.throws(() => Event.assertNotEmitted('user:created'), AssertionError, message)
  }

  @Test()
  public async shouldAssertListenersWithoutFaking({ assert }: Context) {
    function auditListener() {}

    Event.on('user:created', auditListener)

    assert.doesNotThrow(() => Event.assertListening('user:created', auditListener))
  }
}
