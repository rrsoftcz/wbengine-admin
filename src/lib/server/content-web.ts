import {error} from '@sveltejs/kit';import {RemoteFailure} from './api-contract.ts';
export async function contentLoad<T>(action:()=>Promise<T>):Promise<T>{try{return await action();}catch(cause){if(cause instanceof RemoteFailure)error(cause.status>=400&&cause.status<=599?cause.status:502,cause.message);throw cause;}}
