export interface IElectronAPI {
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    has: (key: string) => Promise<boolean>;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
