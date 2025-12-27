/**
 * Schema Tests - Zod schema utilities and validation
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  nonEmptyString,
  positiveInteger,
  nonNegativeNumber,
  temperatureSchema,
  messageSchema,
  messagesArraySchema,
  toolDefinitionSchema,
  formatZodError,
  createValidationErrorMessage,
  safeParse,
} from '../../src/schemas/common.js';

describe('Common Schemas', () => {
  describe('nonEmptyString', () => {
    it('should accept non-empty strings', () => {
      expect(nonEmptyString.parse('hello')).toBe('hello');
      expect(nonEmptyString.parse(' ')).toBe(' ');
    });

    it('should reject empty strings', () => {
      expect(() => nonEmptyString.parse('')).toThrow();
    });
  });

  describe('positiveInteger', () => {
    it('should accept positive integers', () => {
      expect(positiveInteger.parse(1)).toBe(1);
      expect(positiveInteger.parse(100)).toBe(100);
    });

    it('should reject zero and negative numbers', () => {
      expect(() => positiveInteger.parse(0)).toThrow();
      expect(() => positiveInteger.parse(-1)).toThrow();
    });

    it('should reject non-integers', () => {
      expect(() => positiveInteger.parse(1.5)).toThrow();
    });
  });

  describe('nonNegativeNumber', () => {
    it('should accept zero and positive numbers', () => {
      expect(nonNegativeNumber.parse(0)).toBe(0);
      expect(nonNegativeNumber.parse(1.5)).toBe(1.5);
    });

    it('should reject negative numbers', () => {
      expect(() => nonNegativeNumber.parse(-0.1)).toThrow();
    });
  });

  describe('temperatureSchema', () => {
    it('should accept values between 0 and 2', () => {
      expect(temperatureSchema.parse(0)).toBe(0);
      expect(temperatureSchema.parse(1)).toBe(1);
      expect(temperatureSchema.parse(2)).toBe(2);
      expect(temperatureSchema.parse(0.7)).toBe(0.7);
    });

    it('should reject values outside range', () => {
      expect(() => temperatureSchema.parse(-0.1)).toThrow();
      expect(() => temperatureSchema.parse(2.1)).toThrow();
    });
  });

  describe('messageSchema', () => {
    it('should accept valid messages', () => {
      const message = { role: 'user' as const, content: 'Hello' };
      expect(messageSchema.parse(message)).toEqual(message);
    });

    it('should accept all valid roles', () => {
      const roles = ['system', 'user', 'assistant', 'tool'] as const;
      for (const role of roles) {
        expect(messageSchema.parse({ role, content: 'test' })).toHaveProperty('role', role);
      }
    });

    it('should reject invalid roles', () => {
      expect(() => messageSchema.parse({ role: 'invalid', content: 'test' })).toThrow();
    });

    it('should accept optional fields', () => {
      const message = {
        role: 'assistant' as const,
        content: 'Response',
        name: 'helper',
        tool_call_id: 'call_123',
      };
      expect(messageSchema.parse(message)).toEqual(message);
    });
  });

  describe('messagesArraySchema', () => {
    it('should accept non-empty arrays of messages', () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      expect(messagesArraySchema.parse(messages)).toEqual(messages);
    });

    it('should reject empty arrays', () => {
      expect(() => messagesArraySchema.parse([])).toThrow();
    });
  });

  describe('toolDefinitionSchema', () => {
    it('should accept valid tool definitions', () => {
      const tool = {
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
          },
        },
      };
      expect(toolDefinitionSchema.parse(tool)).toEqual(tool);
    });

    it('should require function name', () => {
      const invalidTool = {
        type: 'function' as const,
        function: {
          description: 'Missing name',
        },
      };
      expect(() => toolDefinitionSchema.parse(invalidTool)).toThrow();
    });
  });
});

describe('Error Formatting Utilities', () => {
  describe('formatZodError', () => {
    it('should format single error', () => {
      const schema = z.object({ name: z.string() });
      const result = schema.safeParse({ name: 123 });

      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted).toContain('name');
        expect(typeof formatted).toBe('string');
      }
    });

    it('should format multiple errors', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const result = schema.safeParse({ name: 123, age: 'old' });

      if (!result.success) {
        const formatted = formatZodError(result.error);
        expect(formatted).toContain('name');
        expect(formatted).toContain('age');
      }
    });
  });

  describe('createValidationErrorMessage', () => {
    it('should create descriptive error message', () => {
      const schema = z.object({ email: z.string().email() });
      const result = schema.safeParse({ email: 'invalid' });

      if (!result.success) {
        const message = createValidationErrorMessage('userInput', result.error);
        expect(message).toContain('Validation failed');
        expect(message).toContain('userInput');
      }
    });
  });

  describe('safeParse', () => {
    it('should return success result for valid data', () => {
      const schema = z.object({ value: z.number() });
      const result = safeParse(schema, { value: 42 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ value: 42 });
      }
    });

    it('should return error result for invalid data', () => {
      const schema = z.object({ value: z.number() });
      const result = safeParse(schema, { value: 'not a number' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(typeof result.error).toBe('string');
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });
});
