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
import { QueueProvider } from '@athenna/queue'
import { LoggerProvider } from '@athenna/logger'
import { constants } from '#tests/fixtures/constants/index'
import { EventProvider } from '#src/providers/EventProvider'
import { Test, Mock, BeforeEach, AfterEach, type Context } from '@athenna/test'

export class EventProviderTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))

    await new LoggerProvider().register()
    await new QueueProvider().register()
    await new EventProvider().register()
  }

  @AfterEach()
  public async afterEach() {
    await new EventProvider().shutdown()
    await new QueueProvider().shutdown()
    await new LoggerProvider().shutdown()

    Mock.restoreAll()
    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToRegisterEventImplementationInTheContainer({ assert }: Context) {
    await new EventProvider().register()

    assert.isTrue(ioc.has('Athenna/Core/Event'))
  }

  @Test()
  public async shouldBeAbleToUseEventImplementationFromFacade({ assert }: Context) {
    await new EventProvider().register()

    assert.isDefined(Event.queue)
  }

  @Test()
  public async shouldBeAbleToCloseAllConsumersOnShutdown({ assert }: Context) {
    await new EventProvider().register()

    Event.on('test1', () => {})
    Event.on('test2', () => {})

    assert.equal(Event.consumerCount(), 1)

    await new EventProvider().shutdown()

    assert.equal(Event.consumerCount(), 0)
  }

  @Test()
  public async shouldNotThrowErrorIfProviderIsNotRegisteredWhenShuttingDown({ assert }: Context) {
    await assert.doesNotReject(() => new EventProvider().shutdown())
  }

  @Test()
  public async shouldLoadListenersAndRegisterEventsFile({ assert }: Context) {
    constants.RUN_MAP.helloListener = false
    constants.RUN_MAP.productListener = false
    constants.RUN_MAP.annotatedListener = false
    constants.RUN_MAP.decoratedListener = false
    constants.RUN_MAP.closureListener = false
    constants.PRODUCTS.length = 0
    constants.LAST_EVENT = null

    assert.equal(Config.get('rc.events.path'), '#tests/fixtures/events/index')

    await new EventProvider().register()

    assert.isTrue(ioc.has('HelloListener'))
    assert.isTrue(ioc.has('ProductListener'))
    assert.isTrue(ioc.has('annotatedListener'))

    assert.equal(Event.listenerCount('helloListener'), 1)
    assert.equal(Event.listenerCount('productListener'), 1)
    assert.equal(Event.listenerCount('annotatedListener'), 1)
    assert.equal(Event.listenerCount('closureListener'), 1)

    Event.store('memoryA')

    await Event.emit('helloListener')
    await Event.emit('productListener', { id: 1 })
    await Event.emit('annotatedListener')
    await Event.emit('closureListener', { ok: true })

    await Sleep.for(200).milliseconds().wait()

    assert.isTrue(constants.RUN_MAP.helloListener)
    assert.isTrue(constants.RUN_MAP.productListener)
    assert.isTrue(constants.RUN_MAP.annotatedListener)
    assert.isTrue(constants.RUN_MAP.decoratedListener)
    assert.isTrue(constants.RUN_MAP.closureListener)
    assert.deepEqual(constants.PRODUCTS, [{ id: 1 }])
    assert.isDefined(constants.LAST_EVENT)
    assert.deepEqual(constants.LAST_EVENT.data, { ok: true })
  }
}
