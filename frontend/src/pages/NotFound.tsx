import { useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button, EmptyState, Panel } from "../components/ui";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Panel>
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="Page not found"
        description="That route does not exist in the console. Check the navigation or return to the overview."
        action={<Button onClick={() => navigate("/overview")}>Go to overview</Button>}
      />
    </Panel>
  );
}
