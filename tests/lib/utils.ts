export function seconds(time?: Date | number): number {
    if (typeof time === 'undefined') {
        return seconds(Date.now());
    } else if (typeof time === 'number') {
        return time / 1000;
    } else {
        return seconds(time.getTime());
    }
}

export function wait(milliseconds: number = 100): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}
