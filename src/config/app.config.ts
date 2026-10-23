const appConfig =  {
    port: parseInt(process.env.APP_PORT || '8000', 10),
    host: process.env.APP_HOST || 'localhost',
}
export default appConfig;