import { redirect } from "next/navigation";

/** Old hub address: the buyer dashboard lives at /account. */
export default function Page() {
  redirect("/account");
}
