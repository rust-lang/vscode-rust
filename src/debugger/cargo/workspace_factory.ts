import { dirname } from 'path';

import { CachingFactory, Factory, profile, progress } from '../util';
import { Context } from '../util/context';
import Metadata, { PackageMetadata, parsePkgId } from './metadata';
import Package, { LibraryType } from './package';
import CargoWorkspace from './workspace';

export class CargoWorkspaceFactory extends CachingFactory<CargoWorkspace> {
  constructor(private readonly metadata: Factory<Metadata>) {
    super([metadata]);
  }

  /**
   * Run `cargo metadata`
   */
  @profile('CargoWorkspaceFactory.get_uncached')
  @progress('Parsing cargo workspace')
  public async get_uncached(ctx: Context): Promise<CargoWorkspace> {
    const data = await this.metadata.get(ctx);

    const packages = data.packages.map(p =>
      intoPackage(data.target_directory, p),
    );

    const members = data.workspace_members
      .sort()
      .map(parsePkgId)
      .map(
        ({ id }): Package => {
          for (const p of packages) {
            if (p.name === id) {
              p.isMember = true;
              return p;
            }
          }
          throw new Error(
            `'cargo metadata' says that an unknown package (${id}) is a member of the current workspace`,
          );
        },
      );

    return new CargoWorkspace(
      data.workspace_root,
      data.target_directory,
      members,
      packages.sort((l, r) => {
        if (l.isMember === r.isMember) {
          return l.name.localeCompare(r.name);
        }

        return r.isMember ? 1 : 0 - (l.isMember ? 1 : 0);
      }),
    );
  }
}

function intoPackage(
  targetDir: string,
  p: PackageMetadata,
): PackageMetadata & {
  manifest_dir: string;
  isMember: boolean;
  libType: LibraryType;
  targetDir: string;
} {
  let libType = LibraryType.None;
  for (const t of p.targets) {
    if (t.kind.length !== 1) {
      throw new Error(
        `Unexpected target.kind: ${t.kind} found from crate ${p.name}`,
      );
    }

    const {
      kind: [kind],
    } = t;

    if (kind === 'lib') {
      libType = LibraryType.Normal;
      break;
    } else if (kind === 'proc-macro') {
      libType = LibraryType.ProcMacro;
      break;
    }
  }

  return {
    ...p,
    manifest_dir: dirname(p.manifest_path),
    isMember: false,
    libType,
    targetDir,
  };
}
