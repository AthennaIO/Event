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
import { BaseCommand, Argument } from '@athenna/artisan'

export class MakeListenerCommand extends BaseCommand {
  @Argument({
    description: 'The event listener name.'
  })
  public name: string

  public static signature(): string {
    return 'make:listener'
  }

  public static description(): string {
    return 'Make a new event listener file.'
  }

  public async handle(): Promise<void> {
    this.logger.simple('({bold,green} [ MAKING LISTENER ])\n')

    const destination = Config.get(
      'rc.commands.make:listener.destination',
      Path.listeners()
    )

    const file = await this.generator
      .fileName(this.name)
      .destination(destination)
      .template('listener')
      .setNameProperties(true)
      .make()

    this.logger.success(
      `Listener ({yellow} "${file.name}") successfully created.`
    )

    const importPath = this.generator.getImportPath()

    await this.rc.pushTo('events.listeners', importPath).save()

    this.logger.success(
      `Athenna RC updated: ({dim,yellow} [ events.listeners += "${importPath}" ])`
    )
  }
}
