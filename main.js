import { routeLoader } from './src/lib/routesLoader.js';



async function setupApp(app, options = {}) {
  
    await routeLoader.loadRoutes(app, 'api', '/api/v1');
  
};


export default setupApp;
