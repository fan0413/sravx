<script>
import { h } from 'vue'

// Native H5 buttons preserve keyboard, focus and disabled semantics.
export default {
  inheritAttrs: false,
  emits: ['click'],
  render() { return h('button', { ...this.$attrs, class: ['buy-button', this.$attrs.class], type: 'button', onClick: event => this.$emit('click', event) }, this.$slots.default?.()) }
}
</script>
