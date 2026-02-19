import 'reflect-metadata';

export function OnWeaverEvent(eventType: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const events = Reflect.getMetadata('weaver:events', target.constructor) || [];
    events.push({ event: eventType, handler: propertyKey });
    Reflect.defineMetadata('weaver:events', events, target.constructor);
    return descriptor;
  };
}

export function WeaverRoute(method: string, path: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const routes = Reflect.getMetadata('weaver:routes', target.constructor) || [];
    routes.push({ method: method.toUpperCase(), path, handler: propertyKey });
    Reflect.defineMetadata('weaver:routes', routes, target.constructor);
    return descriptor;
  };
}
