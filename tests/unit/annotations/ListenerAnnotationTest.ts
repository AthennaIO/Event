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
  @Cleanup(() => ioc.reconstruct())
  public async shouldNotReRegisterTheListenerAliasIfItIsAlreadyRegisteredInTheServiceContainer({ assert }: Context) {
    ioc.singleton('App/Listeners/ProductListener', () => {})

    const ProductListener = await this.import('#tests/fixtures/listeners/ProductListener')

    assert.isFalse(Annotation.isAnnotated(ProductListener))
  }
}
