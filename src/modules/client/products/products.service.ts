import prisma from "../../../lib/prisma";

/**
 * Read-only product catalog for a building. Consumed by the chatbot service
 * (product recommendations) and cached there by Building.productUpdatedAt.
 */
export const getProductsForBuilding = async (buildingId: string) => {
  const products = await prisma.product.findMany({
    where: { buildingId },
    select: {
      id: true,
      name: true,
      brand: true,
      price: true,
      rating: true,
      reviewCount: true,
      category: true,
      subCategory: true,
      poiId: true,
    },
    orderBy: { rating: "desc" },
  });
  return products;
};
