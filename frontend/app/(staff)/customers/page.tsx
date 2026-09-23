import { UserList } from "@/components/users/user-list";

export const metadata = { title: "مشتریان" };

export default function CustomersPage() {
  return <UserList kind="customers" />;
}
