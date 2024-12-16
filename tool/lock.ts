export function createLock(concurrency: number) {
    const pending: ((count: number) => void)[] = [];

    let count = 0;
    return {
        async acquire(): Promise<number> {
            if (count >= concurrency) {
                return await new Promise<number>(resolve => pending.push(resolve));
            }

            return count++;
        },

        release() {
            if (pending.length) {
                pending.shift()!(count);
                return count;
            }

            return count--;
        }
    };
}