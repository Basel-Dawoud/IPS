import prisma from "../../../lib/prisma";
import { CreateCategoryInput, UpdateCategoryInput } from "./categories.schema";

/** Full taxonomy tree: parent categories (parentId null) each with their
 *  sub-categories. Includes keywords and usage counts for the admin UI. */
export const getCategoryTree = async () => {
  const nodes = await prisma.poiCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { pois: true, products: true } } },
  });

  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  const shape = (n: (typeof nodes)[number]) => ({
    id: n.id,
    name: n.name,
    description: n.description,
    keywords: n.keywords,
    parentId: n.parentId,
    poiCount: n._count.pois,
    productCount: n._count.products,
  });

  return (byParent.get(null) ?? []).map((parent) => ({
    ...shape(parent),
    children: (byParent.get(parent.id) ?? []).map(shape),
  }));
};

export const createCategory = async (data: CreateCategoryInput) => {
  return prisma.poiCategory.create({
    data: {
      name: data.name.trim(),
      description: data.description ?? null,
      keywords: data.keywords ?? [],
      parentId: data.parentId ?? null,
    },
  });
};

export const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  return prisma.poiCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.keywords !== undefined ? { keywords: data.keywords } : {}),
      ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
    },
  });
};

/** Returns { blocked, reason? }. A node in use (by children, POIs, products, or
 *  user interests) is not deleted so the taxonomy stays referentially clean. */
export const deleteCategory = async (id: string) => {
  const node = await prisma.poiCategory.findUnique({
    where: { id },
    include: { _count: { select: { children: true, pois: true, products: true, users: true } } },
  });
  if (!node) return { blocked: true as const, reason: "not_found" };

  const { children, pois, products, users } = node._count;
  if (children > 0) return { blocked: true as const, reason: `has ${children} sub-categories` };
  if (pois > 0) return { blocked: true as const, reason: `used by ${pois} POIs` };
  if (products > 0) return { blocked: true as const, reason: `used by ${products} products` };
  if (users > 0) return { blocked: true as const, reason: `chosen by ${users} users` };

  await prisma.poiCategory.delete({ where: { id } });
  return { blocked: false as const };
};
