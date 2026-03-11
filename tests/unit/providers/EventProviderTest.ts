/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path } from '@athenna/common'
import { Config } from '@athenna/config'
import { Event } from '#src/facades/Event'
import { EventProvider } from '#src/providers/EventProvider'
import { Test, Mock, BeforeEach, AfterEach, type Context } from '@athenna/test'

export class EventProviderTest {
  @BeforeEach()
  public async beforeEach() {
    await Config.loadAll(Path.fixtures('config'))
  }

  @AfterEach()
  public async afterEach() {
    Mock.restoreAll()
    ioc.reconstruct()
    Config.clear()
  }

  @Test()
  public async shouldBeAbleToRegisterEventImplementationInTheContainer({ assert }: Context) {
    new EventProvider().register()

    assert.isTrue(ioc.has('Athenna/Core/Event'))
  }

  @Test()
  public async shouldBeAbleToUseEventImplementationFromFacade({ assert }: Context) {
    new EventProvider().register()

    assert.isDefined(Event.queue)
  }

  @Test()
  public async shouldBeAbleToCloseAllConsumersOnShutdown({ assert }: Context) {
    new EventProvider().register()

    Event.on('test1', () => {})
    Event.on('test2', () => {})

    assert.equal(Event.consumerCount(), 1)

    new EventProvider().shutdown()

    assert.equal(Event.consumerCount(), 0)
  }

  @Test()
  public async shouldNotThrowErrorIfProviderIsNotRegisteredWhenShuttingDown({ assert }: Context) {
    await assert.doesNotReject(() => new EventProvider().shutdown())
  }
}
