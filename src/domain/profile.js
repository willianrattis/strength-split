export function profileAge(birthDate, now = new Date()){
  if(!birthDate) return null;
  const [y,m,d] = birthDate.split("-").map(Number);
  if(!y || !m || !d) return null;
  const t = now;
  let a = t.getFullYear() - y;
  if((t.getMonth()+1) < m || ((t.getMonth()+1) === m && t.getDate() < d)) a--;
  return (a >= 10 && a <= 99) ? a : null;
}
