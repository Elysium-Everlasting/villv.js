import path from 'node:path'

import type { WatchOptions } from 'chokidar'
import colors from 'picocolors'

import { getWorkspaceRoot } from '../../utils/project.js'
import { CLIENT_DIRECTORY } from '../constants.js'
import type { CommonServerOptions } from '../http.js'
import type { Logger } from '../logger.js'
import { isInNodeModules, isParentDirectory, normalizePath } from '../utils.js'

import type { HmrOptions } from './hmr.js'

export interface ServerOptions extends CommonServerOptions {
  /**
   * Configure HMR-specific (i.e. websocket) client options.
   *
   * Set to false to disable HMR.
   */
  hmr?: HmrOptions | boolean

  /**
   * Configure the chokidar watcher.
   */
  watch?: WatchOptions

  /**
   * Configure the middleware mode.
   *
   * Set to false to disable.
   */
  middlewareMode?: boolean | MiddlewareMode

  /**
   * Configure how files are handled by the server.
   */
  fs?: FileSystemOptions

  /**
   * Origin for the generated asset URLs.
   *
   * @example 'http://127.0.0.1:8080'
   */
  origin?: string

  /**
   * Whether to pre-transform known direct imports.
   *
   * @default true
   */
  preTransformRequests?: boolean

  /**
   * Whether to ignore-list source files in the development server's source map,
   * used to populate the [`x_google_ignoreList` source map extension](https://developer.chrome.com/blog/devtools-better-angular-debugging/#the-x_google_ignorelist-source-map-extension)
   *
   * By default, it excludes all paths containing 'node_modules'.
   * You can pass false to disable this behavior, or a function that receives the
   * source path and sourcemap path and returns a boolean indicating whether to ignore the file.
   */
  sourcemapIgnoreList?: false | ((sourcePath: string, sourcemapPath: string) => boolean)

  /**
   * Force dependency pre-optimization regardless of whether dependencies have changed.
   *
   * @deprecated Use {@link optimizeDeps.force} instead
   */
  force?: boolean
}

/**
 */
export type MiddlewareMode = 'html' | 'ssr'

/**
 * Control how files are served by the server.
 */
export interface FileSystemOptions {
  /**
   * Strictly prevent files outside of allowed paths to be accessed.
   *
   * Set to false to disable the check.
   *
   * @default true
   */
  strict?: boolean

  /**
   * Restrict accessing files outside of the specified paths.
   *
   * Accepts absolute file paths or paths relative to the project root.
   * Will attempt to search for the workspace root by default.
   */
  allow?: string[]

  /**
   * Restrict accessing files that match the specified patterns.
   *
   * This will have higher priority than {@link allow}.
   * Patterns are interpreted by [picomatch](https://github.com/micromatch/picomatch)
   *
   * @default ['.env', '.env.*', '*.crt', '*.pem']
   */
  deny?: string[]
}

export interface ResolvedServerOptions extends ServerOptions {
  fs: Required<FileSystemServeOptions>
  middlewareMode: boolean
  sourcemapIgnoreList: Exclude<ServerOptions['sourcemapIgnoreList'], false | undefined>
}

export interface FileSystemServeOptions {
  /**
   * Strictly restrict file accessing outside of allowing paths.
   *
   * Set to `false` to disable the warning
   *
   * @default true
   */
  strict?: boolean

  /**
   * Restrict accessing files outside the allowed directories.
   *
   * Accepts absolute path or a path relative to project root.
   * Will try to search up for workspace root by default.
   */
  allow?: string[]

  /**
   * Restrict accessing files that matches the patterns.
   *
   * This will have higher priority than `allow`.
   * picomatch patterns are supported.
   *
   * @default ['.env', '.env.*', '*.crt', '*.pem']
   */
  deny?: string[]
}

export function resolveServerOptions(root: string, raw: ServerOptions | undefined, logger: Logger) {
  let allowDirs = raw?.fs?.allow

  const deny = raw?.fs?.deny ?? ['.env', '.env.*', '*.{crt,pem}']

  if (!allowDirs) {
    allowDirs = [getWorkspaceRoot(root)]
  }

  allowDirs = allowDirs.map((i) => resolvedAllowDir(root, i))

  allowDirs = allowDirs.map((i) => resolvedAllowDir(root, i))

  // only push client dir when vite itself is outside-of-root
  const resolvedClientDir = resolvedAllowDir(root, CLIENT_DIRECTORY)

  if (!allowDirs.some((directory) => isParentDirectory(directory, resolvedClientDir))) {
    allowDirs.push(resolvedClientDir)
  }

  const server: ResolvedServerOptions = {
    preTransformRequests: true,
    ...raw,
    sourcemapIgnoreList:
      raw?.sourcemapIgnoreList === false
        ? () => false
        : raw?.sourcemapIgnoreList ?? isInNodeModules,
    middlewareMode: !!raw?.middlewareMode,
    fs: {
      strict: raw?.fs?.strict ?? true,
      allow: allowDirs,
      deny,
    },
  }

  if (server.origin?.endsWith('/')) {
    server.origin = server.origin.slice(0, -1)
    logger.warn(
      colors.yellow(
        `${colors.bold('(!)')} server.origin should not end with "/". Using "${
          server.origin
        }" instead.`,
      ),
    )
  }

  return server
}

function resolvedAllowDir(root: string, dir: string): string {
  return normalizePath(path.resolve(root, dir))
}
