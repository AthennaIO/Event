/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Annotation } from '@athenna/ioc'
import { BaseTest } from '#tests/helpers/BaseTest'
import { Test, type Context, Cleanup, AfterEach } from '@athenna/test'

export default class ListenerAnnotationTest extends BaseTest {
  @AfterEach()
  public async afterEach() {
    ioc.reconstruct()
  }

  @Test()
  public async shouldBeAbleToPreregisterListenersUsingListenerAnnotation({ assert }: Context) {
    const ProductListener = await this.import('#tests/fixtures/listeners/ProductListener')

    const metadata = Annotation.getMeta(ProductListener)

    assert.isFalse(metadata.registered)
    assert.equal(metadata.camelAlias, 'ProductListener')
    assert.equal(metadata.type, 'transient')
    assert.equal(metadata.connection, 'memory')
    assert.equal(metadata.alias, 'App/Listeners/ProductListener')
  }

  @Test()
  public async shouldNotDefineAConnectionWhenTheListenerDoesNotDeclareOne({ assert }: Context) {
    const DelayedListener = await this.import('#tests/fixtures/listeners/DelayedListener')

    const metadata = Annotation.getMeta(DelayedListener)

    /**
     * Without a connection the listener follows `Event.store()`, so the
     * annotation must not freeze the `event.store` value of import time.
     */
    assert.isUndefined(metadata.connection)
    assert.equal(metadata.delay, 60)
  }

  @Test()
  public async shouldStoreTheQueueOptionsOfTheListener({ assert }: Context) {
    const ViaMethodsListener = await this.import('#tests/fixtures/listeners/ViaMethodsListener')

    const metadata = Annotation.getMeta(ViaMethodsListener)

    assert.equal(metadata.connection, 'memoryB')
    assert.equal(metadata.queue, 'annotation-queue')
  }

  @Test()
  @Cleanup(() => ioc.reconstruct())
  public async shouldNotReRegisterTheListenerAliasIfItIsAlreadyRegisteredInTheServiceContainer({ assert }: Context) {
    ioc.singleton('App/Listeners/ProductListener', () => {})

    const ProductListener = await this.import('#tests/fixtures/listeners/ProductListener')

    assert.isFalse(Annotation.isAnnotated(ProductListener))
  }
}
