const utils = {
  formatDate(date) {
    return date.toISOString().split("T")[0];
  },

  uuid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};
