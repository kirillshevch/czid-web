import { TableRow, TableRowProps } from "czifui";
import React from "react";
import cs from "./styled_table_row.scss";

export const StyledTableRow = React.forwardRef<
  HTMLTableRowElement,
  TableRowProps
>(function styledTableRow(props, ref) {
  return <TableRow {...props} className={cs.styledTableRow} ref={ref} />;
});