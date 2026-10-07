export class EmptyCatalogRepository {
  async home() {
    return { products: [], categories: [] };
  }

  async listProducts() {
    return [];
  }

  async getProduct() {
    return null;
  }

  async listCategories() {
    return [];
  }

  async listBanners() {
    return [];
  }

  async getServiceContent() {
    return null;
  }

  async listPointsProducts() {
    return { products: [], categories: [] };
  }

  async getPointsProduct() {
    return null;
  }
}
