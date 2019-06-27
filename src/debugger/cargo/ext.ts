import { Disposable, workspace } from 'vscode';
import CargoTaskProvider from './task_provider';

/**
 * Extension for cargo.
 */
export default class CargoExt implements Disposable {
    private disposable: Disposable;

    public constructor(taskProvider: CargoTaskProvider) {
        const disposables: Disposable[] = [];

        disposables.push(workspace.registerTaskProvider('cargo', taskProvider));

        this.disposable = Disposable.from(...disposables);
    }

    public dispose() {
        this.disposable.dispose();
    }
}
