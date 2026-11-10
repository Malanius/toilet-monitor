export interface AppInfo {
  appName: string;
  appEnv: string;
}

export const isProd = ({ appEnv }: AppInfo): boolean => appEnv === 'prod';
