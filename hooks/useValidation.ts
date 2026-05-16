import { useState, useCallback, useEffect } from 'react';

export interface ValidationRules {
  required?: boolean;
  maxLength?: number;
}

export interface ValidationMessages {
  required?: string;
  maxLength?: string;
}

export type FieldErrors = {
  [key in keyof ValidationRules]?: string;
};

const defaultMessages: Required<ValidationMessages> = {
  required: 'This field is required.',
  maxLength: 'Input exceeds maximum length.',
};

/**
 * A reusable React hook for handling input validation.
 *
 * @param value The current string value of the input field.
 * @param rules An object defining the validation rules to apply.
 * @param customMessages Optional custom error messages.
 * @returns An object containing validation state and functions.
 */
export function useValidation(
  value: string,
  rules: ValidationRules,
  customMessages?: ValidationMessages
) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isTouched, setIsTouched] = useState<boolean>(false);

  const messages = { ...defaultMessages, ...customMessages };

  const validate = useCallback(() => {
    const newErrors: FieldErrors = {};

    if (rules.required && !value.trim()) {
      newErrors.required = messages.required;
    }

    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      newErrors.maxLength = messages.maxLength;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [value, rules, messages]);

  useEffect(() => {
    if (isTouched) {
      validate();
    }
  }, [value, isTouched, validate]);

  const markAsTouched = useCallback(() => {
    if (!isTouched) {
      setIsTouched(true);
    }
  }, [isTouched]);
  
  const reset = useCallback(() => {
    setIsTouched(false);
    setErrors({});
  }, []);

  return {
    errors,
    isTouched,
    isValid: Object.keys(errors).length === 0,
    validate,
    markAsTouched,
    reset,
  };
}
