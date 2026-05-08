/** Mot de passe temporaire lisible (sans caractères ambigus 0/O, 1/l, I, etc.). */
export function generateTempPassword(): string {
  const chars =
    "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "Oryx-";
  for (let i = 0; i < 8; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return pwd;
}
