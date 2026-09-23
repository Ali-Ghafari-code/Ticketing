import { UserList } from "@/components/users/user-list";

export const metadata = { title: "کاربران" };

export default function UsersPage() {
  return <UserList kind="users" />;
}
