export function createLock(concurrency: number) {
    const pending: ((count: number) => void)[] = [];
    return {
        count: 0,
        async acquire(): Promise<number> {
            if (this.count >= concurrency) {
                return await new Promise<number>(resolve => pending.push(resolve));
            }

            return this.count++;
        },

        release() {
            if (pending.length) {
                pending.shift()!(this.count);
                return this.count;
            }

            return this.count--;
        }
    };
}