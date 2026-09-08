export { CosDIException, CosDIParentTypeReferenceNotFound } from './CosDIException.ts';
export { Lifetime } from './Lifetime.ts';
export { Token, createToken, typeKeyName, isToken, isServiceKey } from './Token.ts';
export type { TypeKey, TypeKeyOf, ServiceKey, ServiceKeyHint } from './Token.ts';

/**
 * Maps a service key to the type it resolves to. An interface leaves no value
 * behind for a key, so its name is the key, and this map is what tells
 * TypeScript which type that name stands for:
 *
 * ```ts
 * declare module 'cosdi' {
 *     interface ServiceTypes {
 *         'IExampleService': IExampleService;
 *     }
 * }
 * ```
 *
 * The CosDI Codegen extension writes that file for you, which is why a tagged
 * interface needs nothing but the interface. Keys work without the map; only
 * the resolved type falls back to `object`.
 */
export interface ServiceTypes {
}
export { isDisposable } from './IDisposable.ts';
export type { IDisposable } from './IDisposable.ts';
export type { IInjector } from './IInjector.ts';
export type { IInstanceProvider } from './IInstanceProvider.ts';
export type { IInjectParameter } from './IInjectParameter.ts';
export { Registration } from './Registration.ts';
export { RegistrationBuilder } from './RegistrationBuilder.ts';
export { ObjectResolverToken } from './IObjectResolver.ts';
export type { IObjectResolver, IScopedObjectResolver } from './IObjectResolver.ts';
export { Container, ScopedContainer } from './Container.ts';
export { ContainerBuilder, ScopedContainerBuilder } from './ContainerBuilder.ts';
export type { IContainerBuilder } from './ContainerBuilder.ts';
export { registerDisposeCallback } from './ContainerBuilderExtensions.ts';
export {
    resolveOf, tryResolveOf, resolveOrDefault, resolveAllOf, resolveOrParameter,
} from './IObjectResolverExtensions.ts';
export { AmbientResolver } from './AmbientResolver.ts';
export { inject } from './Annotations/inject.ts';
export { injectable } from './Annotations/injectable.ts';
export { key } from './Annotations/key.ts';
export {
    IInitializable, IPostInitializable, IStartable, IPostStartable,
    ITickable, IPostTickable, ILateTickable, IAsyncStartable,
} from './Annotations/EntryPoints.ts';
export { LifetimeScope } from './Cocos/LifetimeScope.ts';
export { CosDISettings } from './Cocos/CosDISettings.ts';
export type { IInstaller } from './Cocos/IInstaller.ts';
export { ActionInstaller } from './Cocos/ActionInstaller.ts';
export {
    injectNode, injectScene, instantiateAndInject, instantiateNode,
    findComponentInNode, findComponentInScene, hasInjectMetadata,
} from './Cocos/ObjectResolverCocosExtensions.ts';
export {
    EntryPointsBuilder, useEntryPoints, registerEntryPoint,
    registerEntryPointExceptionHandler, registerComponent,
    registerComponentInHierarchy, registerComponentOnNewNode,
    registerComponentInNewPrefab,
} from './Cocos/ContainerBuilderCocosExtensions.ts';
export { ComponentRegistrationBuilder } from './Cocos/ComponentRegistrationBuilder.ts';
export { EntryPointDispatcher } from './Cocos/EntryPointDispatcher.ts';
export { EntryPointExceptionHandler } from './Cocos/EntryPointExceptionHandler.ts';
export { DiagnosticsCollector } from '../Diagnostics/DiagnosticsCollector.ts';
export { DiagnosticsContext } from '../Diagnostics/DiagnosticsContext.ts';
export type {
    DiagnosticsSnapshot,
    DiagnosticsScopeSnapshot,
    DiagnosticsRegistrationSnapshot,
    DiagnosticsBenchmarkSnapshot,
    DiagnosticsBenchmarkRow,
} from '../Diagnostics/DiagnosticsContext.ts';
export { DiagnosticsBridge } from '../Diagnostics/DiagnosticsBridge.ts';
export { DiagnosticsOverlay } from '../Diagnostics/DiagnosticsOverlay.ts';
export { DiagnosticsInfo } from '../Diagnostics/DiagnosticsInfo.ts';
export { RegisterInfo } from '../Diagnostics/RegisterInfo.ts';
export { ResolveInfo } from '../Diagnostics/ResolveInfo.ts';
