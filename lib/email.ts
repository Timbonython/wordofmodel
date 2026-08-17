/** Deliberately permissive. The only thing worth rejecting is what cannot be a
 *  deliverable address, because every extra rule costs a real prospect. */
export function validEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(email)) return null;
  if (email.includes('..')) return null;
  return email;
}
