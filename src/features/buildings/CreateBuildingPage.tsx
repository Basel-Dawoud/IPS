import { useNavigate } from "react-router-dom";
import {
  useCreateBuilding,
  useUpdateBuildingZone,
  useUploadBuildingImage,
} from "./hooks";
import { BuildingForm, type BuildingFormSubmit } from "./components/BuildingForm";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CreateBuildingPage() {
  const navigate = useNavigate();
  const createMutation = useCreateBuilding();
  const zoneUpdateMutation = useUpdateBuildingZone();
  const uploadImageMutation = useUploadBuildingImage();

  const handleSubmit = async (data: BuildingFormSubmit) => {
    try {
      const created = await createMutation.mutateAsync(data.text);
      if (data.zone) {
        await zoneUpdateMutation.mutateAsync({ id: created.id, zone: data.zone });
      }
      if (data.imageFile) {
        await uploadImageMutation.mutateAsync({ id: created.id, file: data.imageFile });
      }
      toast.success("Building created successfully");
      navigate(`/buildings/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create building");
    }
  };

  const isSubmitting =
    createMutation.isPending ||
    zoneUpdateMutation.isPending ||
    uploadImageMutation.isPending;

  return (
    <div className="space-y-6 w-full py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/buildings")}
          className="h-8 px-2"
        >
          <ArrowLeft className="size-4 mr-1" />
          Back to Buildings
        </Button>
      </div>

      <Card className="border shadow-md bg-card/40 backdrop-blur-sm">
        <CardContent className="p-6">
          <BuildingForm
            building={null}
            onSubmit={handleSubmit}
            submitting={isSubmitting}
            onCancel={() => navigate("/buildings")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
