import { z } from "zod";

export const createTenantSchema = z.object({
  business_name: z.string().min(1, "Business name is required"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  domain: z.string().optional(),
  description: z.string().optional(),
  slug: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z
      .string()
      .min(2)
      .max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
  ),
  /** tenant_registry.id of a row with tenant_kind = template */
  source_template_tenant_id: z
    .string()
    .uuid("Choose a demo template to copy from"),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().min(1, "Business name is required").optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid email address").optional(),
  domain: z.string().optional(),
  description: z.string().optional(),
});

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
