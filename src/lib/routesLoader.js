import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RouteLoader {
  constructor() {
    this.loadedRoutes = new Map();
    this.routeInfo = new Map();
    this.middlewares = new Map();
  }

  addMiddleware(basePath, middleware) {
    this.middlewares.set(basePath, middleware);
    console.log(`Middleware registered for base path: ${basePath}`);
  }

  removeMiddleware(basePath) {
    this.middlewares.delete(basePath);
  }

  async loadRoutes(app, routesDir, basePath = '', options = {}) {
    try {
      const baseRoutesPath = path.join(__dirname, "../routes");

      console.log(`Loading routes with: ${routesDir} from ${baseRoutesPath}`);
      console.log(`Base path: ${basePath || '/'}`);
      
      const absoluteRoutesDir = path.join(baseRoutesPath, routesDir);
      
      if (!fs.existsSync(absoluteRoutesDir)) {
        console.error(`Directory not found: ${absoluteRoutesDir}`);
        return { success: false, error: 'Directory not found' };
      }

      this.loadedRoutes.clear();
      this.routeInfo.clear();

      if (this.middlewares.has(basePath)) {
        const middleware = this.middlewares.get(basePath);
        app.use(basePath, middleware);
        console.log(`Applied registered middleware for base path: ${basePath}`);
      }

      if (options.middleware) {
        app.use(basePath, options.middleware);
        console.log(`Applied custom middleware from options for base path: ${basePath}`);
      }

      await this.loadDirectory(app, absoluteRoutesDir, basePath, '');

      console.log('All routes loaded successfully');
      
      return { 
        success: true, 
        totalRoutes: this.loadedRoutes.size,
        routes: Array.from(this.loadedRoutes.entries()) 
      };
    } catch (error) {
      console.error('Error loading routes:', error);
      return { success: false, error: error.message };
    }
  }

  async loadDirectory(app, baseDir, basePath, currentPath) {
    const fullPath = path.join(baseDir, currentPath);
    const items = fs.readdirSync(fullPath);

    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const fullItemPath = path.join(baseDir, itemPath);
      const stat = fs.statSync(fullItemPath);

      if (stat.isDirectory()) {
        await this.loadDirectory(app, baseDir, basePath, itemPath);
      } else if (this.isRouteFile(item)) {
        await this.loadRouterFile(app, baseDir, basePath, itemPath);
      }
    }
  }

  isRouteFile(filename) {
    const validExtensions = ['.js', '.mjs', '.cjs'];
    const isHiddenFile = filename.startsWith('.');
    const hasValidExtension = validExtensions.some(ext => filename.endsWith(ext));
    
    return !isHiddenFile && hasValidExtension;
  }

  async loadRouterFile(app, baseDir, basePath, filePath) {
    try {
      const routePath = this.createRoutePath(basePath, filePath);
      const modulePath = `file://${path.join(baseDir, filePath)}`;
      const module = await import(modulePath);

      if (!module.default) {
        console.log(`No router found in: ${filePath}`);
        return;
      }

      app.use(routePath, module.default);
      
      const routes = this.extractRoutesFromRouter(module.default, routePath);
      this.loadedRoutes.set(filePath, { routePath, routes });
      this.storeRouteInfo(module.default, routePath, filePath);

      console.log(`Loaded: ${filePath} -> ${routePath}`);
      
      if (routes.length > 0) {
        console.log(` Routes in ${filePath}:`);
        routes.forEach(route => {
          console.log(`      ${route.method} ${route.fullPath}`);
        });
      }

    } catch (error) {
      console.error(`Error loading file: ${filePath}`, error.message);
    }
  }

  createRoutePath(basePath, filePath) {
    let routePath = filePath.replace(/\\/g, '/');
    routePath = routePath.replace(/\.[^/.]+$/, '');

    if (path.basename(routePath) === 'index') {
      routePath = path.dirname(routePath).replace(/\\/g, '/');
    }

    if (routePath.startsWith('/')) {
      routePath = routePath.substring(1);
    }

    let fullPath;
    if (basePath && basePath !== '/') {
      fullPath = basePath.endsWith('/') ? basePath + routePath : basePath + '/' + routePath;
    } else {
      fullPath = '/' + routePath;
    }

    fullPath = fullPath.replace(/\/+/g, '/');

    return fullPath || '/';
  }

  extractRoutesFromRouter(router, basePath) {
    const routes = [];
    
    if (router.stack) {
      router.stack.forEach(layer => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods)
            .filter(method => layer.route.methods[method])
            .map(method => method.toUpperCase());
          
          methods.forEach(method => {
            const routePath = layer.route.path;

            const cleanBasePath = basePath.replace(/\\/g, '/');
            const cleanRoutePath = routePath.replace(/\\/g, '/');
            
            let fullPath = cleanBasePath;
            if (cleanRoutePath !== '/') {
              fullPath += cleanRoutePath;
            }

            fullPath = fullPath.replace(/\/+/g, '/');
            
            routes.push({
              method,
              path: cleanRoutePath,
              fullPath: fullPath,
              basePath: cleanBasePath
            });
          });
        }
      });
    }
    
    return routes;
  }

  storeRouteInfo(router, basePath, filePath) {
    const routes = this.extractRoutesFromRouter(router, basePath);
    
    routes.forEach(route => {
      const key = `${route.method}:${route.fullPath}`;
      this.routeInfo.set(key, {
        method: route.method,
        path: route.fullPath,
        basePath: basePath,
        file: filePath,
        routePath: route.path
      });
    });
  }

  getAllEndpoints(app) {
    const endpoints = [];
    
    if (!app._router || !app._router.stack) {
      return endpoints;
    }

    const processStack = (stack, basePath = '') => {
      stack.forEach(layer => {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods)
            .filter(method => layer.route.methods[method])
            .map(method => method.toUpperCase());
          
          methods.forEach(method => {
            const routePath = layer.route.path;
            
            const cleanBasePath = basePath.replace(/\\/g, '/');
            const cleanRoutePath = routePath.replace(/\\/g, '/');
            
            let fullPath = cleanBasePath;
            if (cleanRoutePath !== '/') {
              fullPath += cleanRoutePath;
            }
            fullPath = fullPath.replace(/\/+/g, '/');

            endpoints.push({
              method,
              path: fullPath,
              originalPath: cleanRoutePath,
              basePath: cleanBasePath
            });
          });
        } else if (layer.name === 'router' && layer.handle.stack) {
          const routerBasePath = basePath + (layer.regexp.toString() !== '/^\\/?(?=\\/|$)/i' ? 
            this.getPathFromRegex(layer.regexp) : '');
          processStack(layer.handle.stack, routerBasePath.replace(/\\/g, '/'));
        }
      });
    };

    processStack(app._router.stack);
    
    return endpoints.sort((a, b) => a.path.localeCompare(b.path));
  }

  getPathFromRegex(regex) {
    const match = regex.toString().match(/^\/\^\\\/(.*)\\\/\?/);
    return match ? `/${match[1]}` : '';
  }

  getRoutesByMethod(method) {
    const filteredRoutes = [];
    
    this.routeInfo.forEach((info, key) => {
      if (info.method === method.toUpperCase()) {
        filteredRoutes.push(info);
      }
    });
    
    return filteredRoutes.sort((a, b) => a.path.localeCompare(b.path));
  }

  getRoutesByPath(pathPattern) {
    const filteredRoutes = [];
    const pattern = new RegExp(pathPattern);
    
    this.routeInfo.forEach((info, key) => {
      if (pattern.test(info.path)) {
        filteredRoutes.push(info);
      }
    });
    
    return filteredRoutes.sort((a, b) => a.path.localeCompare(b.path));
  }

  getRoutesByFile(filename) {
    const filteredRoutes = [];
    
    this.routeInfo.forEach((info, key) => {
      if (info.file === filename || info.file.endsWith(filename)) {
        filteredRoutes.push(info);
      }
    });
    
    return filteredRoutes.sort((a, b) => a.path.localeCompare(b.path));
  }

  getRouteStats() {
    const stats = {
      total: this.routeInfo.size,
      byMethod: {},
      byFile: {},
      byBasePath: {}
    };

    this.routeInfo.forEach((info) => {
      stats.byMethod[info.method] = (stats.byMethod[info.method] || 0) + 1;
      stats.byFile[info.file] = (stats.byFile[info.file] || 0) + 1;
      stats.byBasePath[info.basePath] = (stats.byBasePath[info.basePath] || 0) + 1;
    });

    return stats;
  }

  printAllRoutes(app) {
    const endpoints = this.getAllEndpoints(app);
    
    console.log('\nALL REGISTERED ENDPOINTS:');
    console.log('=' .repeat(60));
    
    if (endpoints.length === 0) {
      console.log('No routes found');
      return;
    }

    let currentBasePath = '';
    
    endpoints.forEach(endpoint => {
      if (endpoint.basePath !== currentBasePath) {
        currentBasePath = endpoint.basePath;
        console.log(`\n${currentBasePath || '/'}`);
      }
      
      console.log(`   ${endpoint.method.padEnd(6)} ${endpoint.path}`);
    });
    
    console.log('=' .repeat(60));
    console.log(`Total: ${endpoints.length} endpoints`);
  }

  exportRoutesAsJSON(app) {
    const endpoints = this.getAllEndpoints(app);
    const stats = this.getRouteStats();
    
    return {
      generatedAt: new Date().toISOString(),
      stats: stats,
      endpoints: endpoints
    };
  }

  findRouteByPath(app, path) {
    const endpoints = this.getAllEndpoints(app);
    return endpoints.find(endpoint => endpoint.path === path);
  }

  hasRoute(app, method, path) {
    const endpoints = this.getAllEndpoints(app);
    return endpoints.some(endpoint => 
      endpoint.method === method.toUpperCase() && endpoint.path === path
    );
  }

  getRouteConflicts(app) {
    const endpoints = this.getAllEndpoints(app);
    const conflicts = new Map();
    
    endpoints.forEach(endpoint => {
      const key = `${endpoint.method}:${endpoint.path}`;
      if (!conflicts.has(key)) {
        conflicts.set(key, []);
      }
      conflicts.get(key).push(endpoint);
    });
    
    const result = [];
    conflicts.forEach((routes, key) => {
      if (routes.length > 1) {
        result.push({
          path: routes[0].path,
          method: routes[0].method,
          count: routes.length,
          routes: routes
        });
      }
    });
    
    return result;
  }

  getRegisteredMiddlewares() {
    return Array.from(this.middlewares.entries()).map(([basePath, middleware]) => ({
      basePath,
      middleware: middleware.name || 'anonymous'
    }));
  }

  clearAllMiddlewares() {
    this.middlewares.clear();
    console.log('All middlewares cleared');
  }
}

const routeLoader = new RouteLoader();

export { routeLoader, RouteLoader };
