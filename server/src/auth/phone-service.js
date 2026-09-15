export function createPhoneService({ requestPhone, bindPhone } = {}) {
  if (typeof requestPhone !== 'function') throw new Error('requestPhone is required.');
  if (typeof bindPhone !== 'function') throw new Error('bindPhone is required.');
  return Object.freeze({
    async bind(userId, code) {
      if (!Number.isInteger(userId) || userId <= 0) throw new Error('A valid user id is required.');
      const phone = await requestPhone(code);
      if (!/^\+?[0-9]{6,20}$/.test(phone)) throw new Error('WeChat phone exchange returned an invalid phone.');
      const result = await bindPhone(userId, phone);
      if (!result) throw new Error('User account is unavailable.');
      return { phone };
    }
  });
}
