export function getInstance(): {
    emit(eventName: any, ...args: any[]): void;
    on(eventName: any, callback: any): {
        eventName: any;
        callback: any;
        off: () => void;
    };
    off(eventName: any, callback: any): void;
};
export declare namespace instance {
    function emit(eventName: any, ...args: any[]): void;
    function on(eventName: any, callback: any): {
        eventName: any;
        callback: any;
        off: () => void;
    };
    function off(eventName: any, callback: any): void;
}
//# sourceMappingURL=emitter.d.ts.map