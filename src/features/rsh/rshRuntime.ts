import {rshApi} from "../../shared/tauri/rshCommands";
import {RshTaskOwner} from "./RshTaskOwner";
import {RshOutputBuffer} from "./RshOutputBuffer";
export interface RshTaskSession {owner:RshTaskOwner;output:RshOutputBuffer;}
export function createRshTask():RshTaskSession{return {owner:new RshTaskOwner(rshApi),output:new RshOutputBuffer()};}
