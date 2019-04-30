import { Factory } from '../util';
import { Context } from '../util/context';
import Rustc from './rustc';


export class RustcResolver extends Factory<Rustc> {
    constructor() {
        super([]);
    }

    public async get(ctx: Context): Promise<Rustc> {
        // TODO
        return new Rustc(ctx, 'rustc');
    }
}
