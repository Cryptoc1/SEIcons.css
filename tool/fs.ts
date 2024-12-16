export function catchFileNotFound<T = undefined>(onFileNotFound?: (e: NodeJS.ErrnoException) => T): (e: any) => Promise<T | undefined> {
    return (e: any) => {
        if (e instanceof Error) {
            const error = <NodeJS.ErrnoException>e;
            if (error.code === 'ENOENT') {
                if (!onFileNotFound) {
                    return Promise.resolve(undefined);
                }

                return Promise.resolve(onFileNotFound(error));
            }
        }

        return Promise.reject(e);
    };
};