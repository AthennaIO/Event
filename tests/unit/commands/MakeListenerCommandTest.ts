/**
 * @athenna/event
 *
 * (c) João Lenon <lenon@athenna.io>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Path, File } from '@athenna/common'
import { Test, type Context } from '@athenna/test'
import { BaseCommandTest } from '#tests/helpers/BaseCommandTest'

export default class MakeListenerCommandTest extends BaseCommandTest {
  @Test()
  public async shouldBeAbleToCreateAListenerFile({ assert, command }: Context) {
    const output = await command.run('make:listener TestListener')

    console.log(output.output.stderr)

    output.assertSucceeded()
    output.assertLogged('[ MAKING LISTENER ]')
    output.assertLogged('[  success  ] Listener "TestListener" successfully created.')
    output.assertLogged('[  success  ] Athenna RC updated: [ listeners += "#src/events/listeners/TestListener" ]')

    const { athenna } = await new File(Path.pwd('package.json')).getContentAsJson()

    assert.isTrue(await File.exists(Path.listeners('TestListener.ts')))
    assert.containSubset(athenna.listeners, ['#src/events/listeners/TestListener'])
  }

  @Test()
  public async shouldBeAbleToCreateAListenerFileWithADifferentDestPathAndImportPath({ assert, command }: Context) {
    const output = await command.run('make:listener TestListener', {
      path: Path.fixtures('consoles/console-mock-dest-import.ts')
    })

    output.assertSucceeded()
    output.assertLogged('[ MAKING LISTENER ]')
    output.assertLogged('[  success  ] Listener "TestListener" successfully created.')
    output.assertLogged(
      '[  success  ] Athenna RC updated: [ listeners += "#tests/fixtures/storage/listeners/TestListener" ]'
    )

    const { athenna } = await new File(Path.pwd('package.json')).getContentAsJson()

    assert.isTrue(await File.exists(Path.fixtures('storage/listeners/TestListener.ts')))
    assert.containSubset(athenna.listeners, ['#tests/fixtures/storage/listeners/TestListener'])
  }

  @Test()
  public async shouldThrowAnExceptionWhenTheFileAlreadyExists({ command }: Context) {
    await command.run('make:listener TestListener')
    const output = await command.run('make:listener TestListener')

    output.assertFailed()
    output.assertLogged('[ MAKING LISTENER ]')
    output.assertLogged('The file')
    output.assertLogged('TestListener.ts')
    output.assertLogged('already exists')
  }
}
