"use client";

import type { Draft } from "@/lib/process";

export function RequestFields({ fields, values, onValueChange }: {
  fields: Draft["fields"];
  values?: Record<string, string>;
  onValueChange?: (key: string, value: string) => void;
}) {
  return <>{fields.map((field, index) => {
    const update = onValueChange ? (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onValueChange(field.key, event.target.value) : undefined;
    const props = {
      name: "field:" + field.key,
      required: field.required,
      value: values ? (Object.hasOwn(values, field.key) ? values[field.key] : "") : undefined,
      onChange: update,
    };
    return <label key={field.key}>
      <span>{field.label.trim() || `Field ${index + 1}`}{!field.required && <small className="optional">Optional</small>}</span>
      {field.type === "select"
        ? <select {...props}><option value="">Select an option</option>
          {[...new Set(field.options.map((option) => option.trim()).filter(Boolean))].map((option) => <option key={option}>{option}</option>)}
        </select>
        : field.type === "textarea" ? <textarea {...props} rows={4} maxLength={4000} />
          : <input {...props} type={field.type} maxLength={4000}
              onInput={field.type === "date" && onValueChange ? (event) =>
                onValueChange(field.key, event.currentTarget.value) : undefined} />}
    </label>;
  })}</>;
}
