import { Agent as LocalAgent } from "@hyperledger/identus-sdk";


/**
 * The LocalAgent is temporary, we should design 1 interface that
 * is able to manage the Agent operations from a shared interface.
 * 
 * We can use the localAgent one as an orientation, 
 * the cloudAgent one is just an API Client.
 * 
 * This interface needs to be replaced with a common, unified interface for both modes
 * 
 */
export type Agent = LocalAgent;