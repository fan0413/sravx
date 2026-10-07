function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function catalogResponse(pathname, searchParams, repository) {
  if (pathname === '/api/v1/catalog/home') {
    return { status: 200, data: await repository.home() };
  }
  if (pathname === '/api/v1/catalog/products') {
    return { status: 200, data: await repository.listProducts({
      categoryId: positiveId(searchParams.get('categoryId')),
      keyword: searchParams.get('keyword') || '',
      page: positiveId(searchParams.get('page')) || 1,
      pageSize: positiveId(searchParams.get('pageSize')) || 20,
      series: searchParams.get('series') || '',
      toolGroup: searchParams.get('toolGroup') || '',
      toolSubtype: searchParams.get('toolSubtype') || '',
      size: searchParams.get('size') || ''
    }) };
  }
  if (pathname.startsWith('/api/v1/catalog/products/')) {
    const product = await repository.getProduct(positiveId(pathname.slice('/api/v1/catalog/products/'.length)));
    return product ? { status: 200, data: product } : { status: 404, error: { code: 'PRODUCT_NOT_FOUND', message: '商品不存在' } };
  }
  if (pathname === '/api/v1/catalog/categories') {
    return { status: 200, data: await repository.listCategories() };
  }
  if (pathname === '/api/v1/catalog/banners') {
    return { status: 200, data: await repository.listBanners(searchParams.get('position') || 'home') };
  }
  if (pathname.startsWith('/api/v1/catalog/service-contents/')) {
    const content = typeof repository.getServiceContent === 'function' ? await repository.getServiceContent(pathname.slice('/api/v1/catalog/service-contents/'.length)) : null;
    return content ? { status: 200, data: content } : { status: 404, error: { code: 'SERVICE_CONTENT_NOT_FOUND', message: '服务内容不存在或尚未发布' } };
  }
  if (pathname === '/api/v1/catalog/points-products') {
    return { status: 200, data: await repository.listPointsProducts({ categoryId: positiveId(searchParams.get('categoryId')) || 0 }) };
  }
  if (pathname.startsWith('/api/v1/catalog/points-products/')) {
    const product = await repository.getPointsProduct(positiveId(pathname.slice('/api/v1/catalog/points-products/'.length)));
    return product ? { status: 200, data: product } : { status: 404, error: { code: 'POINTS_PRODUCT_NOT_FOUND', message: '积分商品不存在' } };
  }
  return null;
}
