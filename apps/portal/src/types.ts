/**
 * @module Types
 * 
 * ## Common Types
 * 
 * Shared TypeScript types and interfaces used across the application.
 * 
 * @category Types
 */
import type mongoose from 'mongoose';

/**
 * Base properties added by Mongoose to all documents.
 * Extend this type when creating document interfaces.
 * 
 * @category Types
 */
export type DocProperties = {
  /** MongoDB document ID */
  _id: mongoose.Types.ObjectId | string;
} & {
  /** Mongoose document version key */
  __v: number;
}