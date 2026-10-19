import { mkdir, open, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function consumeDispatch(directory: string) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const stat = await lstat(directory);
  if (!stat.isDirectory() || (stat.mode & 0o077)!==0) throw Error('private_directory_required');
  const file = await open(resolve(directory,'cart-dispatch-consumed.json'),'wx',0o600);
  try {
    await file.writeFile(JSON.stringify({state:'consumed_do_not_retry',at:new Date().toISOString()}));
    await file.sync();
  } finally {await file.close();}
  const dir = await open(directory,'r');
  try {await dir.sync();} finally {await dir.close();}
}
export async function savePrivateReceipt(directory: string, receipt: unknown) {
  const file = await open(resolve(directory,'receipt.private.json'),'wx',0o600);
  try {await file.writeFile(JSON.stringify(receipt));await file.sync();} finally {await file.close();}
}

export async function savePrivateSelection(directory: string, selection: unknown) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if(!info.isDirectory() || (info.mode & 0o077)!==0) throw Error('private_directory_required');
  const file=await open(resolve(directory,'selection.private.json'),'wx',0o600);
  try {await file.writeFile(JSON.stringify(selection));await file.sync();} finally {await file.close();}
  const dir=await open(directory,'r');
  try {await dir.sync();} finally {await dir.close();}
}

