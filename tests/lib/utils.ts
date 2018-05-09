export function seconds(time?: Date | number, round: boolean = false): number {
    if (typeof time === 'undefined') {
        return seconds(Date.now(), round);
    } else if (typeof time === 'number') {
        time = time / 1000;
        return round ? Math.round(time) : time;
    } else {
        return seconds(time.getTime(), round);
    }
}

export function wait(milliseconds: number = 100): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}
