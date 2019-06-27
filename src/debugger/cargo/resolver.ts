import Cargo from '.';
import { Factory, progress } from '../util';
import { Context } from '../util/context';

export default class CargoResolver extends Factory<Cargo> {
    constructor() {
        super([]);
    }

    @progress('Resolving cargo')
    public async get(_ctx: Context): Promise<Cargo> {
        // TODO
        return new Cargo('cargo');
    }
}
