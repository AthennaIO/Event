/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Module } from '@athenna/common'

export class BaseTest {
  /**
   * Safe import a module, avoiding cache and if
   * the module is not found, return null.
   */
  public async import<T = any>(path: string): Promise<T> {
    try {
      return await Module.get(import(`${path}.js?version=${Math.random()}`))
    } catch (error) {
      console.log(error)
      return null
    }
  }
}
