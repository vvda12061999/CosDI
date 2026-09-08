import { createToken, injectable } from 'cosdi';

export const ISingleton1 = createToken<ISingleton1>('ISingleton1');
export const ISingleton2 = createToken<ISingleton2>('ISingleton2');
export const ISingleton3 = createToken<ISingleton3>('ISingleton3');
export const ITransient1 = createToken<ITransient1>('ITransient1');
export const ITransient2 = createToken<ITransient2>('ITransient2');
export const ITransient3 = createToken<ITransient3>('ITransient3');
export const ICombined1 = createToken<ICombined1>('ICombined1');
export const ICombined2 = createToken<ICombined2>('ICombined2');
export const ICombined3 = createToken<ICombined3>('ICombined3');
export const IFirstService = createToken<IFirstService>('IFirstService');
export const ISecondService = createToken<ISecondService>('ISecondService');
export const IThirdService = createToken<IThirdService>('IThirdService');
export const ISubObjectOne = createToken<ISubObjectOne>('ISubObjectOne');
export const ISubObjectTwo = createToken<ISubObjectTwo>('ISubObjectTwo');
export const ISubObjectThree = createToken<ISubObjectThree>('ISubObjectThree');
export const ISubObjectA = createToken<ISubObjectA>('ISubObjectA');
export const ISubObjectB = createToken<ISubObjectB>('ISubObjectB');
export const ISubObjectC = createToken<ISubObjectC>('ISubObjectC');
export const IComplex1 = createToken<IComplex1>('IComplex1');
export const IComplex2 = createToken<IComplex2>('IComplex2');
export const IComplex3 = createToken<IComplex3>('IComplex3');

export interface ISingleton1 { doSomething(): void; }
export interface ISingleton2 { doSomething(): void; }
export interface ISingleton3 { doSomething(): void; }
export interface ITransient1 { doSomething(): void; }
export interface ITransient2 { doSomething(): void; }
export interface ITransient3 { doSomething(): void; }
export interface ICombined1 { doSomething(): void; }
export interface ICombined2 { doSomething(): void; }
export interface ICombined3 { doSomething(): void; }
export interface IFirstService {}
export interface ISecondService {}
export interface IThirdService {}
export interface ISubObjectOne {}
export interface ISubObjectTwo {}
export interface ISubObjectThree {}
export interface ISubObjectA {}
export interface ISubObjectB {}
export interface ISubObjectC {}
export interface IComplex1 {}
export interface IComplex2 {}
export interface IComplex3 {}

export class Singleton1 implements ISingleton1 {
    doSomething(): void {}
}
export class Singleton2 implements ISingleton2 {
    doSomething(): void {}
}
export class Singleton3 implements ISingleton3 {
    doSomething(): void {}
}

export class Transient1 implements ITransient1 {
    doSomething(): void {}
}
export class Transient2 implements ITransient2 {
    doSomething(): void {}
}
export class Transient3 implements ITransient3 {
    doSomething(): void {}
}

@injectable(ISingleton1, ITransient1)
export class Combined1 implements ICombined1 {
    constructor(first?: ISingleton1, second?: ITransient1) {
        if (!first || !second) {
            throw new Error('Combined1 missing dependency');
        }
    }
    doSomething(): void {}
}

@injectable(ISingleton2, ITransient2)
export class Combined2 implements ICombined2 {
    constructor(first?: ISingleton2, second?: ITransient2) {
        if (!first || !second) {
            throw new Error('Combined2 missing dependency');
        }
    }
    doSomething(): void {}
}

@injectable(ISingleton3, ITransient3)
export class Combined3 implements ICombined3 {
    constructor(first?: ISingleton3, second?: ITransient3) {
        if (!first || !second) {
            throw new Error('Combined3 missing dependency');
        }
    }
    doSomething(): void {}
}

export class FirstService implements IFirstService {}
export class SecondService implements ISecondService {}
export class ThirdService implements IThirdService {}

@injectable(IFirstService)
export class SubObjectOne implements ISubObjectOne {
    constructor(firstService?: IFirstService) {
        if (!firstService) {
            throw new Error('SubObjectOne missing dependency');
        }
    }
}

@injectable(ISecondService)
export class SubObjectTwo implements ISubObjectTwo {
    constructor(secondService?: ISecondService) {
        if (!secondService) {
            throw new Error('SubObjectTwo missing dependency');
        }
    }
}

@injectable(IThirdService)
export class SubObjectThree implements ISubObjectThree {
    constructor(thirdService?: IThirdService) {
        if (!thirdService) {
            throw new Error('SubObjectThree missing dependency');
        }
    }
}

export class SubObjectA implements ISubObjectA {}
export class SubObjectB implements ISubObjectB {}
export class SubObjectC implements ISubObjectC {}

@injectable(IFirstService, ISecondService, IThirdService, ISubObjectOne, ISubObjectTwo, ISubObjectThree)
export class Complex1 implements IComplex1 {
    constructor(
        firstService?: IFirstService,
        secondService?: ISecondService,
        thirdService?: IThirdService,
        subObjectOne?: ISubObjectOne,
        subObjectTwo?: ISubObjectTwo,
        subObjectThree?: ISubObjectThree,
    ) {
        if (!firstService || !secondService || !thirdService || !subObjectOne || !subObjectTwo || !subObjectThree) {
            throw new Error('Complex1 missing dependency');
        }
    }
}

@injectable(IFirstService, ISecondService, IThirdService, ISubObjectOne, ISubObjectTwo, ISubObjectThree)
export class Complex2 implements IComplex2 {
    constructor(
        firstService?: IFirstService,
        secondService?: ISecondService,
        thirdService?: IThirdService,
        subObjectOne?: ISubObjectOne,
        subObjectTwo?: ISubObjectTwo,
        subObjectThree?: ISubObjectThree,
    ) {
        if (!firstService || !secondService || !thirdService || !subObjectOne || !subObjectTwo || !subObjectThree) {
            throw new Error('Complex2 missing dependency');
        }
    }
}

@injectable(IFirstService, ISecondService, IThirdService, ISubObjectOne, ISubObjectTwo, ISubObjectThree)
export class Complex3 implements IComplex3 {
    constructor(
        firstService?: IFirstService,
        secondService?: ISecondService,
        thirdService?: IThirdService,
        subObjectOne?: ISubObjectOne,
        subObjectTwo?: ISubObjectTwo,
        subObjectThree?: ISubObjectThree,
    ) {
        if (!firstService || !secondService || !thirdService || !subObjectOne || !subObjectTwo || !subObjectThree) {
            throw new Error('Complex3 missing dependency');
        }
    }
}
