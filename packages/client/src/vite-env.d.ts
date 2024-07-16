/// <reference types="vite/client" />


declare interface _AMapSecurityConfig {
  securityJsCode: string
}



declare interface Window {
  _AMapSecurityConfig: _AMapSecurityConfig
  AMapLoader: {
    load(options?: {
      key?: string;
      version?: string;
      plugins?: string[];
      callback?: () => void;
    }): Promise<any>
  }
  AMap: any
}