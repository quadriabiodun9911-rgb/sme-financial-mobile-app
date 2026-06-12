let counter = Date.now();

export function generateId(): string {
    counter += 1;
    const hex = (n: number) => n.toString(16).padStart(8, '0');
    return `${hex(Date.now())}-${hex(counter)}-${hex(Math.floor(Math.random() * 0xffffffff))}`;
}
